import { IsBoolean, IsIn } from 'class-validator';
import { SituacaoPresenca } from '../schemas/reuniao.schema.js';

export class ResponderConviteReuniaoDto {
  @IsBoolean({ message: 'Informe se o convite foi aceito' })
  aceito: boolean;
}

export class AtualizarPresencaDto {
  @IsIn([SituacaoPresenca.CONFIRMADA, SituacaoPresenca.RECUSADA], {
    message: 'A presença deve ser CONFIRMADA ou RECUSADA',
  })
  situacao: SituacaoPresenca.CONFIRMADA | SituacaoPresenca.RECUSADA;
}
