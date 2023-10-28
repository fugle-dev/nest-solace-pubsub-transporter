import {
  MessageDeliveryModeType,
  Session,
  SessionEventCode,
  SessionEvent,
  SolclientFactory,
} from 'solclientjs';
import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { fromEvent, merge, Observable } from 'rxjs';
import { first, map } from 'rxjs/operators';
import { SolacePubSubOptions } from './solace-pubsub-options.interface';

let solacePackage: any = {};

/**
 * @publicApi
 */
export class SolacePubSubClient extends ClientProxy {
  protected readonly logger = new Logger(ClientProxy.name);
  protected readonly subscriptionsCount = new Map<string, number>();
  protected readonly url: string;
  protected session: Session;
  protected connection: Promise<any>;

  constructor(protected readonly options: SolacePubSubOptions) {
    super();

    solacePackage = loadPackage('solclientjs', SolacePubSubClient.name, () =>
      require('solclientjs'),
    );
    const factoryProps = new solacePackage.SolclientFactoryProperties();
    factoryProps.profile = solacePackage.SolclientFactoryProfiles.version10;
    solacePackage.SolclientFactory.init(factoryProps);
    solacePackage.SolclientFactory.setLogLevel(solacePackage.LogLevel.WARN);

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public close() {
    this.session && this.session.disconnect();
    this.session = null;
    this.connection = null;
  }

  public connect(): Promise<any> {
    if (this.session) {
      return this.connection;
    }

    this.connection = new Promise((resolve, reject) => {
      try {
        this.session = this.createSession();
        this.handleError(this.session);
        this.session.on(
          SessionEventCode.UP_NOTICE,
          (sessionEvent: SessionEvent) => {
            resolve(sessionEvent);
          },
        );
      } catch (err) {
        reject(err);
      }
    });

    return this.connection;
  }

  public mergeCloseEvent<T = any>(
    instance: Session,
    source$: Observable<T>,
  ): Observable<T> {
    const close$ = fromEvent(
      instance,
      SessionEventCode.DISCONNECTED as any,
    ).pipe(
      map((err: any) => {
        throw err;
      }),
    );
    return merge(source$, close$).pipe(first());
  }

  public createSession(): Session {
    const session = SolclientFactory.createSession(this.options);
    session.connect();
    return session;
  }

  public handleError(session: Session) {
    session.addListener(SessionEventCode.DOWN_ERROR as any, (err: any) =>
      this.logger.error(err),
    );
  }

  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const packet = this.assignPacketId(partialPacket);
      const pattern = this.normalizePattern(partialPacket.pattern);
      const serializedPacket = this.serializer.serialize(packet);
      const request = SolclientFactory.createMessage();
      request.setDestination(SolclientFactory.createTopicDestination(pattern));
      request.setBinaryAttachment(JSON.stringify(serializedPacket));
      request.setDeliveryMode(MessageDeliveryModeType.DIRECT);

      this.session.sendRequest(
        request,
        5000, // 5 seconds timeout for this operation
        async function (session, message) {
          const packet = JSON.parse(message.getBinaryAttachment() as string);
          callback({
            response: packet.data,
            isDisposed: true,
          });
        },
        function (session, event) {
          callback({ err: event });
        },
        null, // not providing correlation object
      );
    } catch (err) {
      return callback({ err });
    }
    return;
  }

  protected dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const serializedPacket = this.serializer.serialize(packet);

    const message = SolclientFactory.createMessage();
    message.setDestination(SolclientFactory.createTopicDestination(pattern));
    message.setBinaryAttachment(JSON.stringify(serializedPacket));
    message.setDeliveryMode(MessageDeliveryModeType.DIRECT);

    return new Promise<void>((resolve, reject) => {
      try {
        this.session.send(message);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }
}
