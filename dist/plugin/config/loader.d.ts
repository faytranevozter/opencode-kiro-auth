import { type KiroConfig } from './schema.js'
export { getUserConfigPath } from '../paths.js'
export declare function getProjectConfigPath(directory: string): string
export declare function loadConfig(directory: string): KiroConfig
export declare function configExists(path: string): boolean
export declare function getDefaultLogsDir(): string
