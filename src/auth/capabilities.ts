export function hasCapability(capabilities: AppRecord, name: string) {
  return capabilities?.[name] === true
}
