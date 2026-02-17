import Fastify from 'fastify'

const fastify = Fastify({
  logger: true,
})

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000

// Health check route
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`🚀 API server listening on port ${PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
