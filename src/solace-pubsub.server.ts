import { Message, MessageDeliveryModeType, Session, SessionEventCode, SolclientFactory } from 'solclientjs';
import { isUndefined } from '@nestjs/common/utils/shared.utils';
import { NO_MESSAGE_HANDLER } from '@nestjs/microservices/constants';
import { CustomTransportStrategy, IncomingRequest, MessageHandler, PacketId, ReadPacket, Server } from '@nestjs/microservices';
import { SolacePubSubOptions } from './solace-pubsub-options.interface';
import { SolacePubSubContext } from './solace-pubsub.context';

let solacePackage: any = {};

export class SolacePubSubServer extends Server implements CustomTransportStrategy {
  protected session: Session;

  constructor(private readonly options: SolacePubSubOptions) {
    super();

    solacePackage = this.loadPackage('solclientjs', SolacePubSubServer.name, () =>
      require('solclientjs'),
    );
    const factoryProps = new solacePackage.SolclientFactoryProperties();
    factoryProps.profile = solacePackage.SolclientFactoryProfiles.version10;
    solacePackage.SolclientFactory.init(factoryProps);
    solacePackage.SolclientFactory.setLogLevel(solacePackage.LogLevel.WARN);

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    try {
      this.session = this.createSolaceSession();
      this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  public start(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    this.session.on(SessionEventCode.UP_NOTICE, () => {
      this.handleError(this.session);
      this.bindEvents(this.session);
      callback();
    });
  }

  public bindEvents(session: Session) {
    session.on(SessionEventCode.MESSAGE, this.getMessageHandler(session).bind(this));
    const registeredPatterns = [...this.messageHandlers.keys()];
    registeredPatterns.forEach(pattern => {
      const { isEventHandler } = this.messageHandlers.get(pattern);
      const topicName = isEventHandler ? pattern : this.getRequestPattern(pattern);
      this.session.subscribe(
        SolclientFactory.createTopicDestination(topicName),
        true,
        topicName,
        10000,
      );
    });
  }

  public close() {
    this.session && this.session.disconnect();
  }

  public createSolaceSession(): Session {
    const session = SolclientFactory.createSession(this.options);
    session.connect();
    return session;
  }

  public getMessageHandler(pub: Session): Function {
    return async (
      message: Message,
    ) => this.handleMessage(message, pub);
  }

  public async handleMessage(
    message: Message,
    pub: Session,
  ): Promise<any> {
    const pattern = message.getDestination().name;
    const rawPacket = this.parseMessage(message.getBinaryAttachment());
    const packet = await this.deserializer.deserialize(rawPacket);
    const context = new SolacePubSubContext([message]);
    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(pattern, packet, context);
    }
    const publish = this.getPublisher(
      pub,
      pattern,
      (packet as IncomingRequest).id,
    );
    const handler = this.getHandlerByPattern(pattern);

    if (!handler) {
      const status = 'error';
      const noHandlerPacket = {
        id: (packet as IncomingRequest).id,
        status,
        err: NO_MESSAGE_HANDLER,
      };
      return publish(noHandlerPacket);
    }
    const response$ = this.transformToObservable(
      await handler(packet.data, context),
    );
    response$ && this.send(response$, publish);
  }

  public getPublisher(session: Session, pattern: any, id: string): any {
    return (response: any) => {
      Object.assign(response, { id });
      const outgoingResponse = this.serializer.serialize(response);

      const message = SolclientFactory.createMessage();
      message.setDestination(SolclientFactory.createTopicDestination(this.getReplyPattern(pattern)));
      message.setBinaryAttachment(JSON.stringify(outgoingResponse));
      message.setDeliveryMode(MessageDeliveryModeType.DIRECT);

      return session.send(message);
    };
  }

  public parseMessage(content: any): ReadPacket & PacketId {
    try {
      return JSON.parse(content);
    } catch (e) {
      return content;
    }
  }

  public getRequestPattern(pattern: string): string {
    return pattern;
  }

  public getReplyPattern(pattern: string): string {
    return `${pattern}/reply`;
  }

  public handleError(session: any) {
    session.on(SessionEventCode.DOWN_ERROR, (err: any) => this.logger.error(err));
  }
}
