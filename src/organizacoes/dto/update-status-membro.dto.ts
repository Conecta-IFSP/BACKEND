import { IsIn } from 'class-validator';

import { StatusMembroOrganizacao } from '../schemas/organizacao.schema.js';

export class UpdateStatusMembroDto {
  @IsIn([StatusMembroOrganizacao.APROVADO, StatusMembroOrganizacao.REJEITADO])
  status: StatusMembroOrganizacao;
}
