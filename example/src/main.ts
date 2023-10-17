import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { SolacePubSubServer } from 'nest-solace-pubsub-transporter';
import { AppModule } from './app.module';

async function bootstrap() {
  /**
   * This example contains a hybrid application (HTTP + TCP)
   * You can switch to a microservice with NestFactory.createMicroservice() as follows:
   *
   * const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
   *   strategy: new SolacePubSubServer({
   *     url: 'tcp://localhost:55554',
   *     vpnName: 'default',
   *     userName: 'admin',
   *     password: 'admin',
   *   }),
   * });
   * await app.listen();
   *
   */
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    strategy: new SolacePubSubServer({
      url: 'tcp://localhost:55554',
      vpnName: 'default',
      userName: 'admin',
      password: 'admin',
    }),
  });

  await app.startAllMicroservices();
  await app.listen(3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
