import { IsISO8601, IsOptional } from 'class-validator';

export class RelatorioIndividualDto {
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe uma data inicial válida' })
  de?: string;

  // Limite exclusivo: o aplicativo envia o início do dia seguinte ao último dia.
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe uma data final válida' })
  ate?: string;
}
