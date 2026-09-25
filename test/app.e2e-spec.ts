import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('Aplicação (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('protege o catálogo de organizações sem token', () => {
    return request(app.getHttpServer())
      .get('/organizacoes')
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
