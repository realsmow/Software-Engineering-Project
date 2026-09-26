type OutputSchema = { parse(value: unknown): unknown };

// Service tests bypass tRPC's output parser. Apply the same validation here,
// while preserving the original object so identity assertions still work.
export function withOutputContracts<T extends object>(
  service: T,
  contracts: Partial<Record<keyof T, OutputSchema>>,
): T {
  const methods = service as Record<string, unknown>;
  for (const [name, schema] of Object.entries(contracts)) {
    const original = methods[name] as (...args: unknown[]) => unknown;
    if (typeof original !== 'function' || !schema) {
      throw new Error(`Invalid output contract for ${name}`);
    }
    methods[name] = (...args: unknown[]) => {
      const output: unknown = original.apply(service, args);
      const validate = (value: unknown) => {
        (schema as OutputSchema).parse(value);
        return value;
      };
      return output instanceof Promise
        ? output.then(validate)
        : validate(output);
    };
  }
  return service;
}
