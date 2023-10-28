import { Message, MessageDeliveryModeType, Session, SessionEventCode, SessionEvent, SolclientFactory } from 'solclientjs';
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

    solacePackage = loadPackage('solclientjs', SolacePubSubClient.name, () => require('solclientjs'));
    const factoryProps = new solacePackage.SolclientFactoryProperties();
    factoryProps.profile = solacePackage.SolclientFactoryProfiles.version10;
    solacePackage.SolclientFactory.init(factoryProps);
    solacePackage.SolclientFactory.setLogLevel(solacePackage.LogLevel.WARN);

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public getRequestPattern(pattern: string): string {
    return pattern;
  }

  public getResponsePattern(pattern: string): string {
    return `${pattern}/reply`;
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
        this.session.on(SessionEventCode.MESSAGE, this.createResponseCallback());
        this.session.on(SessionEventCode.UP_NOTICE, (sessionEvent: SessionEvent) => {
          resolve(sessionEvent);
        });
      } catch(err) {
        reject(err);
      }
    });

    return this.connection;
  }

  public mergeCloseEvent<T = any>(
    instance: Session,
    source$: Observable<T>,
  ): Observable<T> {
    const close$ = fromEvent(instance, SessionEventCode.DISCONNECTED as any).pipe(
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
    session.addListener(
      SessionEventCode.DOWN_ERROR as any,
      (err: any) => this.logger.error(err),
    );
  }

  public createResponseCallback(): (message: Message) => any {
    return async (message: Message) => {
      const packet = JSON.parse(message.getBinaryAttachment() as string);
      const { err, response, isDisposed, id } =
        await this.deserializer.deserialize(packet);

      const callback = this.routingMap.get(id);
      if (!callback) {
        return undefined;
      }
      if (isDisposed || err) {
        return callback({
          err,
          response,
          isDisposed: true,
        });
      }
      callback({
        err,
        response,
      });
    };
  }

  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const packet = this.assignPacketId(partialPacket);
      const pattern = this.normalizePattern(partialPacket.pattern);
      const serializedPacket = this.serializer.serialize(packet);

      const responseChannel = this.getResponsePattern(pattern);
      let subscriptionsCount =
        this.subscriptionsCount.get(responseChannel) || 0;

      const publishPacket = () => {
        subscriptionsCount = this.subscriptionsCount.get(responseChannel) || 0;
        this.subscriptionsCount.set(responseChannel, subscriptionsCount + 1);
        this.routingMap.set(packet.id, callback);

        const message = SolclientFactory.createMessage();
        message.setDestination(SolclientFactory.createTopicDestination(pattern));
        message.setBinaryAttachment(JSON.stringify(serializedPacket));
        message.setDeliveryMode(MessageDeliveryModeType.DIRECT);
        this.session.send(message);
      };

      if (subscriptionsCount <= 0) {
        this.session.subscribe(
          SolclientFactory.createTopicDestination(responseChannel),
          true,
          responseChannel,
          10000,
        );
        publishPacket();
      } else {
        publishPacket();
      }

      return () => {
        this.unsubscribeFromChannel(responseChannel);
        this.routingMap.delete(packet.id);
      };
    } catch (err) {
      callback({ err });
    }
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

  protected unsubscribeFromChannel(channel: string) {
    const subscriptionCount = this.subscriptionsCount.get(channel);
    this.subscriptionsCount.set(channel, subscriptionCount - 1);

    if (subscriptionCount - 1 <= 0) {
      this.session.unsubscribe(
        SolclientFactory.createTopicDestination(channel),
        true,
        channel,
        10000,
      );
    }
  }
}
