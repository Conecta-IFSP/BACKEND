import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SituacaoReuniao } from '../schemas/reuniao.schema.js';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Cancela (`situacao`) ou edita a reunião (demais campos); as duas coisas juntas são recusadas no service. */
export class UpdateReuniaoDto {
  @IsOptional()
  @IsIn([SituacaoReuniao.CANCELADA], { message: 'A reunião só pode ser cancelada' })
  situacao?: SituacaoReuniao.CANCELADA;

  @IsOptional()
  @Transform(aparar)
  @IsString({ message: 'Informe o título' })
  @MinLength(3, { message: 'Informe um título com pelo menos 3 caracteres' })
  @MaxLength(120, { message: 'O título deve ter até 120 caracteres' })
  titulo?: string;

  @Transform(aparar)
  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString({ message: 'O local deve ser um texto' })
  @MinLength(2, { message: 'O local deve ter pelo menos 2 caracteres' })
  @MaxLength(120, { message: 'O local deve ter até 120 caracteres' })
  local?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe um início válido' })
  inicio?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe um término válido' })
  fim?: string;

  @IsOptional()
  @IsBoolean({ message: 'Informe se a reunião dura o dia inteiro' })
  dia_inteiro?: boolean;

  @IsOptional()
  @Transform(aparar)
  @IsString({ message: 'A pauta deve ser um texto' })
  @MaxLength(2000, { message: 'A pauta deve ter até 2000 caracteres' })
  pauta?: string;

  @IsOptional()
  @IsArray({ message: 'Informe a lista de convidados' })
  @ArrayUnique({ message: 'Não repita convidados' })
  @IsMongoId({ each: true, message: 'Convidado inválido' })
  convidados_ids?: string[];
}
