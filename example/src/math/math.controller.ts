import { Controller, Get } from '@nestjs/common';
import { ClientProxy, MessagePattern } from '@nestjs/microservices';
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

  @Get()
  execute(): Observable<number> {
    const pattern = { cmd: 'sum' };
    const data = [1, 2, 3, 4, 5];
    return this.client.send<number>(pattern, data);
  }

  @MessagePattern({ cmd: 'sum' })
  sum(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }
}
