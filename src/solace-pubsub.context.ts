import { Message } from 'solclientjs';
import { BaseRpcContext } from '@nestjs/microservices/ctx-host/base-rpc.context';

type SolacePubSubContextArgs = [Message];

export class SolacePubSubContext extends BaseRpcContext<SolacePubSubContextArgs> {
  constructor(args: SolacePubSubContextArgs) {
    super(args);
  }

  /**
   * Returns the original message.
   */
  getMessage() {
    return this.args[0];
  }
}
