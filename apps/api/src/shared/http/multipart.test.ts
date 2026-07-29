import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeMultipartRequest, MultipartRequestError } from './multipart'

test('consumeMultipartRequest streams one file and bounded fields', async () => {
  const form = new FormData()
  form.set('options', '{"minZoom":0}')
  form.set('file', new File([Buffer.from('fixture')], 'fixture.csv', { type: 'text/csv' }))
  const request = new Request('http://planisfy.test/upload', {
    method: 'POST',
    body: form,
  })
  let bytes = 0

  const fields = await consumeMultipartRequest({
    request,
    maxTotalBytes: 4096,
    maxFileBytes: 1024,
    onFile: async ({ stream }) => {
      for await (const chunk of stream) bytes += Buffer.byteLength(chunk)
    },
  })

  assert.equal(bytes, 7)
  assert.equal(fields.options, '{"minZoom":0}')
})

test('consumeMultipartRequest rejects streamed file overflow', async () => {
  const form = new FormData()
  form.set('file', new File([Buffer.alloc(2048)], 'large.bin'))
  const request = new Request('http://planisfy.test/upload', {
    method: 'POST',
    body: form,
  })

  await assert.rejects(
    consumeMultipartRequest({
      request,
      maxTotalBytes: 4096,
      maxFileBytes: 1024,
      onFile: async ({ stream }) => {
        for await (const chunk of stream) {
          void chunk
          // Drain the bounded part.
        }
      },
    }),
    (error: unknown) => error instanceof MultipartRequestError && error.code === 'MULTIPART_LIMIT'
  )
})
