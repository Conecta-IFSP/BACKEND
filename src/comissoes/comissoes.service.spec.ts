import { Test, TestingModule } from '@nestjs/testing';
import { ComissoesService } from './comissoes.service.js';
import { getModelToken } from '@nestjs/mongoose';
import { Comissao } from './schemas/comissao.schema.js';
import { Organizacao } from '../organizacoes/schemas/organizacao.schema.js';
import { Usuario } from '../usuarios/schemas/usuario.schema.js';

describe('ComissoesService', () => {
  let service: ComissoesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComissoesService,
        { provide: getModelToken(Comissao.name), useValue: {} },
        { provide: getModelToken(Organizacao.name), useValue: {} },
        { provide: getModelToken(Usuario.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ComissoesService>(ComissoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
