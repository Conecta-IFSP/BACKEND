import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizacaoDto {
  @IsString({ message: 'Informe o nome da organização' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'O nome deve ter até 100 caracteres' })
  nome: string;

  @IsString({ message: 'Informe a cidade' })
  @MinLength(2, { message: 'Informe a cidade' })
  @MaxLength(60, { message: 'A cidade deve ter no máximo 60 caracteres' })
  cidade: string;

  @IsOptional()
  @IsString({ message: 'A descrição deve ser um texto' })
  @MaxLength(200, { message: 'A descrição deve ter até 200 caracteres' })
  descricao?: string;
}
