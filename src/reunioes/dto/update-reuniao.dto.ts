import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SituacaoReuniao } from '../schemas/reuniao.schema.js';
export class UpdateReuniaoDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Informe um título com pelo menos 3 caracteres' })
  @MaxLength(120, { message: 'O título deve ter até 120 caracteres' })
  titulo?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Informe o local da reunião' })
  @MaxLength(120, { message: 'O local deve ter até 120 caracteres' })
  local?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601({ strict: true }, { message: 'Informe um início válido' })
  inicio?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601({ strict: true }, { message: 'Informe um término válido' })
  fim?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'A pauta deve ser um texto' })
  @MaxLength(2000, { message: 'A pauta deve ter até 2000 caracteres' })
  pauta?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn([SituacaoReuniao.CANCELADA], { message: 'A reunião só pode ser cancelada' })
  situacao?: SituacaoReuniao.CANCELADA;
}
