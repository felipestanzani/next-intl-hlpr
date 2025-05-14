export interface NextIntlConfig {
  locales: string[]
  defaultLocale: string
  messagesPath: string
  requestPath: string
}

export interface MessageConfig {
  namespaces: string[]
  defaultNamespace: string
  loadPath: string
  dynamicImport: boolean
}

export interface ConfigPaths {
  nextConfigPath: string
  requestPath: string
  messagesPath: string
}
