import { Transform } from 'class-transformer';
import { IsIn, IsInt, Min, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class CodigoAcessoDto {
  @Matches(/^[a-f0-9]{64}$/, { message: 'Link de presença inválido' }) codigo: string;
}
export class RegistrarAcessoDto extends CodigoAcessoDto {
  @IsIn(['ENTRADA', 'SAIDA']) acao: 'ENTRADA' | 'SAIDA';
}
export class EnviarAcessoDto extends CodigoAcessoDto {
  @IsIn(['APP', 'EMAIL']) canal: 'APP' | 'EMAIL';
}
export class CorrigirHorarioDto {
  @IsInt() @Min(0) revisao: number;
  @IsISO8601({ strict: true }) entrada: string;
  @IsOptional() @IsISO8601({ strict: true }) saida?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) motivo: string;
}
