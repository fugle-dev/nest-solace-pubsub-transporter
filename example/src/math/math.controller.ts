import { Controller, Get } from '@nestjs/common';
import {
  ClientProxy,
  MessagePattern,
  EventPattern,
} from '@nestjs/microservices';
import { SolacePubSubClient } from 'nest-solace-pubsub-transporter';
import { Observable } from 'rxjs';

@Controller()
export class MathController {
  private readonly client: ClientProxy;

  constructor() {
    this.client = new SolacePubSubClient({
      url: 'tcp://localhost:55554',
      vpnName: 'default',
      userName: 'admin',
      password: 'admin',
    });
  }

  @Get('send')
  send(): Observable<number> {
    const pattern = { cmd: 'sum' };
    const data = [1, 2, 3, 4, 5];
    return this.client.send<number>(pattern, data);
  }

  @Get('emit')
  emit(): Observable<number> {
    const pattern = { cmd: 'sum' };
    const data = [1, 2, 3, 4, 5];
    return this.client.emit<number>(pattern, data);
  }

  @MessagePattern({ cmd: 'sum' })
  messageHandler(data: number[]): number {
    console.log(data);
    return (data || []).reduce((a, b) => a + b);
  }

  @EventPattern({ cmd: 'sum' })
  eventHandler(data: number[]) {
    console.log(data);
  }
}
