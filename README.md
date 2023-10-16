# nest-solace-pubsub-transporter

[![NPM version][npm-image]][npm-url]

> A Nest microservice transporter for Solace PubSub+

## Installation

To begin using it, we first install the required dependency.

```bash
$ npm install --save nest-solace-pubsub-transporter solclientjs
```

## Getting started

To instantiate a microservice, use the `createMicroservice()` method of the `NestFactory` class:

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { SolacePubSubServer } from 'nest-solace-pubsub-transporter';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      strategy: new SolacePubSubServer({
        url: 'tcp://localhost:55554',
        vpnName: 'default',
        userName: 'admin',
        password: 'admin',
      }),
    },
  );
  await app.listen();
}
bootstrap();
```

## Client

Create an instance of `SolacePubSubClient` class and run the `send()` method, subscribing to the returned observable stream.

```typescript
const client = new SolacePubSubClient({
  url: 'tcp://localhost:55554',
  vpnName: 'default',
  userName: 'admin',
  password: 'admin',
});
client
  .send('pattern', 'Hello world!')
  .subscribe((response) => console.log(response));
```

To dispatch an event (instead of sending a message), use the `emit()` method:

```typescript
solacePubSubClient.emit('event', 'Hello world!');
```

## Example

A working example is available [here](https://github.com/fugle-dev/nest-solace-pubsub-transporter/tree/master/example).

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/nest-solace-pubsub-transporter.svg
[npm-url]: https://npmjs.com/package/nest-solace-pubsub-transporter
