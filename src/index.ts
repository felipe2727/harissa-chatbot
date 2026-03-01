import 'dotenv/config';
import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import { webhookRoutes } from './routes/webhook';

const fastify = Fastify({ logger: true });

fastify.register(formbody);
fastify.register(webhookRoutes);

fastify.get('/health', async () => ({ status: 'ok' }));

const port = parseInt(process.env.PORT || '3000', 10);

fastify.listen({ port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Harissa bot listening at ${address}`);
});
