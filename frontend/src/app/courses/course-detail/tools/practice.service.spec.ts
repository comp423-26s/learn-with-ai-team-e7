import { TestBed } from '@angular/core/testing';
import { PracticeService } from './practice.service';
import { Api } from '../../../api/generated/api';

describe('PracticeService', () => {
  let service: PracticeService;
  let apiMock: { invoke: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiMock = { invoke: vi.fn() };

    TestBed.configureTestingModule({
      providers: [PracticeService, { provide: Api, useValue: apiMock }],
    });

    service = TestBed.inject(PracticeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('generatePractice should call api.invoke with correct params', async () => {
    apiMock.invoke.mockResolvedValue({ job_id: 1, status: 'pending' });

    await service.generatePractice(10, 99);

    expect(apiMock.invoke).toHaveBeenCalledWith(expect.any(Function), {
      course_id: 10,
      upload_id: 99,
    });
  });

  it('getPractice should call api.invoke with correct params', async () => {
    apiMock.invoke.mockResolvedValue({ id: 5, course_id: 10, upload_id: 99 });

    await service.getPractice(10, 99);

    expect(apiMock.invoke).toHaveBeenCalledWith(expect.any(Function), {
      course_id: 10,
      upload_id: 99,
    });
  });
});
