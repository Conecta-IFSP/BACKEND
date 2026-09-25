import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class UpdateComissaoDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Informe um nome com pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'O nome deve ter até 100 caracteres' })
  nome?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000, { message: 'A descrição deve ter até 1000 caracteres' })
  descricao?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  ativo?: boolean;
}
