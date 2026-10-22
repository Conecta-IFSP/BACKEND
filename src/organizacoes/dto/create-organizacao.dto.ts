import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizacaoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nome: string;

  @IsString({ message: 'Informe a cidade' })
  @MinLength(2, { message: 'Informe a cidade' })
  @MaxLength(60, { message: 'A cidade deve ter no máximo 60 caracteres' })
  cidade: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descricao?: string;
}
