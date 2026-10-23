import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

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
