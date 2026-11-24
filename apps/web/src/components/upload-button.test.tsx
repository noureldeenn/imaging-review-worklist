import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeStudy } from '../test/handlers';
import { server } from '../test/server';
import { renderWithProviders } from '../test/render';
import { UploadButton } from './upload-button';

describe('UploadButton', () => {
  it('uploads a DICOM file and reports success', async () => {
    let contentType: string | null = null;
    server.use(
      http.post('/api/studies/upload', ({ request }) => {
        contentType = request.headers.get('content-type');
        return HttpResponse.json(
          {
            ...makeStudy(1, { id: 'upload-1234abcd' }),
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<UploadButton />);
    await userEvent.upload(
      screen.getByTestId('upload-input'),
      new File([new Uint8Array([1, 2, 3])], 'a.dcm', { type: 'application/dicom' }),
    );
    expect(await screen.findByText('Uploaded 1 study.')).toBeInTheDocument();
    expect(contentType).toBe('application/dicom');
  });

  it('shows the server reason when a file is rejected', async () => {
    server.use(
      http.post('/api/studies/upload', () =>
        HttpResponse.json(
          { code: 'VALIDATION_ERROR', message: 'The file is not a readable DICOM file' },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<UploadButton />);
    await userEvent.upload(screen.getByTestId('upload-input'), new File(['x'], 'bad.dcm'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'bad.dcm: The file is not a readable DICOM file',
      ),
    );
  });

  it('explains what to do when the server cannot be reached', async () => {
    server.use(http.post('/api/studies/upload', () => HttpResponse.error()));
    renderWithProviders(<UploadButton />);
    await userEvent.upload(screen.getByTestId('upload-input'), new File(['x'], 'a.dcm'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('a.dcm: Could not reach the server'),
    );
  });
});
