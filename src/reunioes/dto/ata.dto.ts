import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const PRAZOS_ATA_HORAS = [24, 72, 168];

const textoOpcional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() || undefined;
};

export class VersaoAtaDto {
  @IsInt({ message: 'Informe a versão da ata' })
  @Min(0, { message: 'Informe a versão da ata' })
  versao: number;
}

export class SalvarAtaDto extends VersaoAtaDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Descreva a ata' })
  @MinLength(20, { message: 'Descreva a ata com pelo menos 20 caracteres' })
  @MaxLength(20000, { message: 'A ata deve ter no máximo 20000 caracteres' })
  conteudo: string;
}

export class EnviarAtaDto extends VersaoAtaDto {
  @IsIn(PRAZOS_ATA_HORAS, {
    message: 'Escolha um prazo de 24 horas, 3 dias ou 7 dias',
  })
  prazo_horas: number;
}

export class ReprovarAtaDto extends VersaoAtaDto {
  @IsOptional()
  @Transform(textoOpcional)
  @IsString({ message: 'Trecho inválido' })
  @MaxLength(20000, { message: 'Trecho inválido' })
  trecho?: string;

  @IsOptional()
  @Transform(textoOpcional)
  @IsString({ message: 'Justificativa inválida' })
  @MaxLength(500, {
    message: 'A justificativa deve ter no máximo 500 caracteres',
  })
  justificativa?: string;
}
