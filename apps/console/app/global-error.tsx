"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  void error

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background font-sans antialiased">
        <div className="mx-auto max-w-md text-center px-4">
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
