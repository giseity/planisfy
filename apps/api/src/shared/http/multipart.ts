import Busboy from 'busboy'
import { Readable, Transform } from 'node:stream'

export class MultipartRequestError extends Error {
  constructor(
    readonly code: 'INVALID_MULTIPART' | 'MULTIPART_LIMIT' | 'UPLOAD_TIMEOUT',
    message: string
  ) {
    super(message)
    this.name = 'MultipartRequestError'
  }
}

export interface MultipartFile {
  fieldName: string
  fileName: string
  contentType: string
  encoding: string
  stream: Readable
}

export async function consumeMultipartRequest(params: {
  request: Request
  maxTotalBytes: number
  maxFileBytes: number
  maxFiles?: number
  maxFields?: number
  maxFieldBytes?: number
  timeoutMs?: number
  onFile: (file: MultipartFile) => Promise<void>
}): Promise<Record<string, string>> {
  const body = params.request.body
  if (!body) {
    throw new MultipartRequestError('INVALID_MULTIPART', 'Multipart request body is missing')
  }

  const maxFiles = params.maxFiles ?? 1
  const maxFields = params.maxFields ?? 8
  const maxFieldBytes = params.maxFieldBytes ?? 16 * 1024
  const timeoutMs = params.timeoutMs ?? 5 * 60 * 1000
  const fields: Record<string, string> = {}
  const pendingFiles: Promise<void>[] = []
  let settled = false

  let parser: ReturnType<typeof Busboy>
  try {
    parser = Busboy({
      headers: Object.fromEntries(params.request.headers),
      limits: {
        files: maxFiles,
        fields: maxFields,
        fieldSize: maxFieldBytes,
        fileSize: params.maxFileBytes,
        headerPairs: 64,
        parts: maxFiles + maxFields,
      },
    })
  } catch {
    throw new MultipartRequestError(
      'INVALID_MULTIPART',
      'Request must use multipart/form-data with a valid boundary'
    )
  }

  const source = Readable.fromWeb(body as unknown as import('node:stream/web').ReadableStream)
  let totalBytes = 0
  const totalLimiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      totalBytes += chunk.byteLength
      if (totalBytes > params.maxTotalBytes) {
        callback(
          new MultipartRequestError(
            'MULTIPART_LIMIT',
            `Multipart request exceeds ${params.maxTotalBytes} bytes`
          )
        )
        return
      }
      callback(null, chunk)
    },
  })

  return await new Promise<Record<string, string>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      fail(
        new MultipartRequestError(
          'UPLOAD_TIMEOUT',
          'Multipart upload did not complete before the timeout'
        )
      )
    }, timeoutMs)
    timeout.unref()

    function cleanup() {
      clearTimeout(timeout)
      source.unpipe(totalLimiter)
      totalLimiter.unpipe(parser)
    }

    function fail(error: unknown) {
      if (settled) return
      settled = true
      cleanup()
      source.on('error', () => undefined)
      source.resume()
      totalLimiter.destroy()
      parser.destroy()
      reject(
        error instanceof MultipartRequestError
          ? error
          : new MultipartRequestError(
              'INVALID_MULTIPART',
              error instanceof Error ? error.message : String(error)
            )
      )
    }

    parser.on('field', (name, value, info) => {
      if (info.valueTruncated) {
        fail(
          new MultipartRequestError(
            'MULTIPART_LIMIT',
            `Multipart field '${name}' exceeds ${maxFieldBytes} bytes`
          )
        )
        return
      }
      if (Object.hasOwn(fields, name)) {
        fail(
          new MultipartRequestError(
            'INVALID_MULTIPART',
            `Multipart field '${name}' was provided more than once`
          )
        )
        return
      }
      fields[name] = value
    })

    parser.on('file', (fieldName, stream, info) => {
      stream.once('limit', () => {
        fail(
          new MultipartRequestError(
            'MULTIPART_LIMIT',
            `Uploaded file exceeds ${params.maxFileBytes} bytes`
          )
        )
      })
      pendingFiles.push(
        params
          .onFile({
            fieldName,
            fileName: info.filename,
            contentType: info.mimeType,
            encoding: info.encoding,
            stream,
          })
          .catch(fail)
      )
    })

    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) {
      parser.once(event, () => {
        fail(
          new MultipartRequestError('MULTIPART_LIMIT', 'Multipart request contains too many parts')
        )
      })
    }

    source.once('error', fail)
    totalLimiter.once('error', fail)
    parser.once('error', fail)
    parser.once('close', () => {
      void Promise.all(pendingFiles)
        .then(() => {
          if (settled) return
          settled = true
          cleanup()
          resolve(fields)
        })
        .catch(fail)
    })

    source.pipe(totalLimiter).pipe(parser)
  })
}
