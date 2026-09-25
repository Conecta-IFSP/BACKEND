import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosService } from './usuarios.service.js';
import { getModelToken } from '@nestjs/mongoose';
import { Usuario } from './schemas/usuario.schema.js';

describe('UsuariosService', () => {
  let service: UsuariosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: getModelToken(Usuario.name), useValue: {} },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
