import { IsMongoId } from 'class-validator';

export class DefinirResponsavelDto {
  @IsMongoId({ message: 'Selecione um responsável válido' })
  usuario_id: string;
}
