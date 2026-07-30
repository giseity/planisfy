import { readFileSync } from 'node:fs'

const requiredPublicVariables = {
  console: [
    'NEXT_PUBLIC_ADMIN_URL',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_AUTH_ORIGIN',
    'NEXT_PUBLIC_AUTH_EMAIL_PASSWORD_ENABLED',
    'NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS',
    'NEXT_PUBLIC_CONSOLE_URL',
    'NEXT_PUBLIC_CONSOLE_API_PATH',
    'NEXT_PUBLIC_DEPLOYMENT_MODE',
    'NEXT_PUBLIC_DOCS_URL',
    'NEXT_PUBLIC_MARKETING_URL',
  ],
  marketing: [
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_AUTH_ORIGIN',
    'NEXT_PUBLIC_AUTH_EMAIL_PASSWORD_ENABLED',
    'NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS',
    'NEXT_PUBLIC_CONSOLE_URL',
    'NEXT_PUBLIC_CONTACT_EMAIL',
    'NEXT_PUBLIC_DOCS_URL',
    'NEXT_PUBLIC_MARKETING_URL',
  ],
  docs: [
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_AUTH_ORIGIN',
    'NEXT_PUBLIC_CONSOLE_URL',
    'NEXT_PUBLIC_DOCS_URL',
  ],
  admin: [
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_AUTH_ORIGIN',
    'NEXT_PUBLIC_AUTH_EMAIL_PASSWORD_ENABLED',
    'NEXT_PUBLIC_CONSOLE_URL',
    'NEXT_PUBLIC_MARKETING_URL',
  ],
}

const requiredRuntimeVariables = {
  api: [
    'NEXT_PUBLIC_AUTH_EMAIL_PASSWORD_ENABLED',
    'NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS',
  ],
}

const compose = JSON.parse(readFileSync(0, 'utf8'))
const errors = []

for (const [serviceName, requiredVariables] of Object.entries(requiredPublicVariables)) {
  const service = compose.services?.[serviceName]
  if (!service) {
    errors.push(`${serviceName}: service is missing`)
    continue
  }

  const buildArguments = service.build?.args ?? {}
  const runtimeEnvironment = service.environment ?? {}
  const dockerfilePath = service.build?.dockerfile
  const dockerfile = dockerfilePath ? readFileSync(dockerfilePath, 'utf8') : ''
  const configuredVariables = new Set([
    ...requiredVariables,
    ...Object.keys(buildArguments).filter((key) => key.startsWith('NEXT_PUBLIC_')),
    ...Object.keys(runtimeEnvironment).filter((key) => key.startsWith('NEXT_PUBLIC_')),
  ])

  for (const variable of configuredVariables) {
    if (!(variable in buildArguments)) {
      errors.push(`${serviceName}: ${variable} is missing from build.args`)
    }
    if (!(variable in runtimeEnvironment)) {
      errors.push(`${serviceName}: ${variable} is missing from runtime environment`)
    }
    if (
      variable in buildArguments &&
      variable in runtimeEnvironment &&
      String(buildArguments[variable]) !== String(runtimeEnvironment[variable])
    ) {
      errors.push(`${serviceName}: ${variable} differs between build and runtime`)
    }

    const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!new RegExp(`^ARG ${escapedVariable}(?:=|$)`, 'm').test(dockerfile)) {
      errors.push(`${serviceName}: Dockerfile does not declare ARG ${variable}`)
    }
    if (!new RegExp(`^ENV ${escapedVariable}=\\$${escapedVariable}$`, 'm').test(dockerfile)) {
      errors.push(
        `${serviceName}: Dockerfile does not promote ${variable} into the build environment`
      )
    }
  }
}

for (const [serviceName, requiredVariables] of Object.entries(requiredRuntimeVariables)) {
  const runtimeEnvironment = compose.services?.[serviceName]?.environment
  if (!runtimeEnvironment) {
    errors.push(`${serviceName}: runtime environment is missing`)
    continue
  }

  for (const variable of requiredVariables) {
    if (!(variable in runtimeEnvironment)) {
      errors.push(`${serviceName}: ${variable} is missing from runtime environment`)
    }
  }
}

if (errors.length > 0) {
  console.error('Managed NEXT_PUBLIC configuration is invalid:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Managed NEXT_PUBLIC build/runtime configuration is aligned.')
