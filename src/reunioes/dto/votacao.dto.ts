import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AbrirVotacaoDto {
  @Transform(aparar)
  @IsString({ message: 'Informe o assunto da votação' })
  @MinLength(3, { message: 'Informe um assunto com pelo menos 3 caracteres' })
  @MaxLength(200, { message: 'O assunto deve ter até 200 caracteres' })
  titulo: string;

  @IsOptional()
  @Transform(aparar)
  @IsString({ message: 'A descrição deve ser um texto' })
  @MaxLength(1000, { message: 'A descrição deve ter até 1000 caracteres' })
  descricao?: string;

  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
      : value,
  )
  @IsArray({ message: 'Informe as opções de voto' })
  @ArrayMinSize(2, { message: 'Informe pelo menos 2 opções de voto' })
  @ArrayMaxSize(10, { message: 'Informe no máximo 10 opções de voto' })
  @IsString({ each: true, message: 'Cada opção deve ser um texto' })
  @MinLength(1, { each: true, message: 'Preencha todas as opções de voto' })
  @MaxLength(80, { each: true, message: 'Cada opção deve ter até 80 caracteres' })
  opcoes: string[];
}

export class VotarDto {
  @IsInt({ message: 'Escolha uma opção de voto' })
  @Min(0, { message: 'Escolha uma opção de voto' })
  opcao: number;
}
