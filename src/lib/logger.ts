type LogLevel = 'info' | 'warn' | 'error'

function log(level: LogLevel, service: string, message: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, service, message, timestamp: new Date().toISOString(), ...extra })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  info: (service: string, message: string, extra?: Record<string, unknown>) => log('info', service, message, extra),
  warn: (service: string, message: string, extra?: Record<string, unknown>) => log('warn', service, message, extra),
  error: (service: string, message: string, extra?: Record<string, unknown>) => log('error', service, message, extra),
}
