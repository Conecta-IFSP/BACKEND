import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class CreateReuniaoDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsArray({ message: 'Informe a lista de convidados' })
  @ArrayUnique({ message: 'Não repita convidados' })
  @IsMongoId({ each: true, message: 'Convidado inválido' })
  convidados_ids?: string[];

  @IsMongoId({ message: 'Selecione uma comissão válida' })
  comissao_id: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Informe o título' })
  @MinLength(3, { message: 'Informe um título com pelo menos 3 caracteres' })
  @MaxLength(120, { message: 'O título deve ter até 120 caracteres' })
  titulo: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Informe o local da reunião' })
  @MinLength(2, { message: 'Informe o local da reunião' })
  @MaxLength(120, { message: 'O local deve ter até 120 caracteres' })
  local: string;

  @IsISO8601({ strict: true }, { message: 'Informe um início válido' })
  inicio: string;

  @IsISO8601({ strict: true }, { message: 'Informe um término válido' })
  fim: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'A pauta deve ser um texto' })
  @MaxLength(2000, { message: 'A pauta deve ter até 2000 caracteres' })
  pauta?: string;
}
