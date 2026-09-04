import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common'
import { ZodSchema } from 'zod'

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const parseResult = this.schema.safeParse(value)
    if (!parseResult.success) {
      const formatted = parseResult.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`)
      throw new BadRequestException(formatted)
    }
    return parseResult.data
  }
}
