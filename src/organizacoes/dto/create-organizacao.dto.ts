import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizacaoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descricao?: string;
}
