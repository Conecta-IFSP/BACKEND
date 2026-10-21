import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class CreateReuniaoDto {
  @IsMongoId({ message: 'Selecione uma comissão válida' })
  comissao_id: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Informe um título com pelo menos 3 caracteres' })
  @MaxLength(120, { message: 'O título deve ter até 120 caracteres' })
  titulo: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Informe o local da reunião' })
  @MaxLength(120, { message: 'O local deve ter até 120 caracteres' })
  local: string;

  @IsISO8601({ strict: true }, { message: 'Informe um início válido' })
  inicio: string;

  @IsISO8601({ strict: true }, { message: 'Informe um término válido' })
  fim: string;

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === 'string' ? item.trim() : item))
          .filter((item) => item !== '')
      : value,
  )
  @IsArray()
  @ArrayMaxSize(30, { message: 'A pauta pode ter até 30 itens' })
  @IsString({ each: true })
  @MaxLength(200, { each: true, message: 'Cada item da pauta deve ter até 200 caracteres' })
  pauta?: string[];
}
