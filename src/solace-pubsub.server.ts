import {
  Message,
  Session,
  SessionEventCode,
  SolclientFactory,
} from 'solclientjs';
import {
  CustomTransportStrategy,
  PacketId,
  ReadPacket,
  Server,
} from '@nestjs/microservices';
import { SolacePubSubOptions } from './solace-pubsub-options.interface';
import { SolacePubSubContext } from './solace-pubsub.context';

let solacePackage: any = {};

export class SolacePubSubServer
  extends Server
  implements CustomTransportStrategy
{
  protected session: Session;

  constructor(private readonly options: SolacePubSubOptions) {
    super();

    solacePackage = this.loadPackage(
      'solclientjs',
      SolacePubSubServer.name,
      () => require('solclientjs'),
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
    session.on(
      SessionEventCode.MESSAGE,
      this.getMessageHandler(session).bind(this),
    );
    const registeredPatterns = [...this.messageHandlers.keys()];
    registeredPatterns.forEach((pattern) => {
      const { isEventHandler } = this.messageHandlers.get(pattern);
      const topicName = isEventHandler
        ? pattern
        : this.getRequestPattern(pattern);
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

  public getMessageHandler(pub: Session) {
    return async (message: Message) => this.handleMessage(message, pub);
  }

  public async handleMessage(message: Message, replier: Session): Promise<any> {
    // console.log(message);
    const pattern = message.getDestination().name;
    const rawPacket = this.parseMessage(message.getBinaryAttachment());
    const packet = await this.deserializer.deserialize(rawPacket);
    const context = new SolacePubSubContext([message]);

    const handler = this.getHandlerByPattern(pattern);

    const result = await handler(packet.data, context);

    if (message.getReplyTo()) {
      const reply = SolclientFactory.createMessage();
      reply.setBinaryAttachment(JSON.stringify({ ...packet, data: result }));
      replier.sendReply(message, reply);
    }
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

  public handleError(session: any) {
    session.on(SessionEventCode.DOWN_ERROR, (err: any) =>
      this.logger.error(err),
    );
  }
}
