# nest-solace-pubsub-transporter

[![NPM version][npm-image]][npm-url]

> A Nest microservice transporter for [Solace PubSub+](https://www.solace.dev/)

## Installation

To begin using it, we first install the required dependency.

```bash
$ npm install --save nest-solace-pubsub-transporter solclientjs
```

## Overview

To use the Solace PubSub+ transporter, pass the following options object with a `strategy` property using `SolacePubSubServer` to the `createMicroservice()` method:

```typescript

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
```

## Options

The `SolacePubSubServer` constructor options object is based on `solace.SessionProperties`. The Solace PubSub+ transporter exposes the properties described [here](https://docs.solace.com/API-Developer-Online-Ref-Documentation/nodejs/solace.SessionProperties.html).

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

## Context

In more sophisticated scenarios, you may want to access more information about the incoming request. When using the Solace PubSub+ transporter, you can access the `SolacePubSubContext` object.

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: SolacePubSubContext) {
  console.log(`Message: ${context.getMessage()}`);
}
```

## Example

A working example is available [here](https://github.com/fugle-dev/nest-solace-pubsub-transporter/tree/master/example).

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/nest-solace-pubsub-transporter.svg
[npm-url]: https://npmjs.com/package/nest-solace-pubsub-transporter
