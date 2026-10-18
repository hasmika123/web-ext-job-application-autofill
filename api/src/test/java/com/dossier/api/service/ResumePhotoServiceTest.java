package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.service.storage.FileStorage;
import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * A photo write that loses a race with the background PDF job (both write the document row) used to fail with a raw
 * {@code error.concurrencyFailure}. It is tried again; a row that never settles still ends in the original error.
 */
class ResumePhotoServiceTest {

    private final ResumeDocService docs = mock(ResumeDocService.class);
    private final ResumePhotoService service = new ResumePhotoService(docs, null, mock(FileStorage.class), mock(ResumeBuilderSettings.class));

    private static ObjectOptimisticLockingFailureException lost() {
        return new ObjectOptimisticLockingFailureException(Object.class, 1L);
    }

    @Test
    void removeTriesAgainWhenTheRowChangedUnderIt() {
        when(docs.photoKeyFor(7L)).thenReturn("resume-photos/1/7-x-photo.jpg");
        ResumeDocService.PhotoChange ok = new ResumeDocService.PhotoChange(null, null);
        when(docs.setPhoto(eq(7L), eq((String) null))).thenThrow(lost()).thenThrow(lost()).thenReturn(ok);

        assertThat(service.remove(7L)).isNull(); // the answered document (null in this stub)
        verify(docs, times(3)).setPhoto(7L, null);
    }

    @Test
    void aRowThatNeverSettlesStillEndsInTheOriginalError() {
        when(docs.photoKeyFor(7L)).thenReturn("resume-photos/1/7-x-photo.jpg");
        when(docs.setPhoto(any(), any())).thenThrow(lost());

        assertThatThrownBy(() -> service.remove(7L)).isInstanceOf(ObjectOptimisticLockingFailureException.class);
        verify(docs, times(ResumePhotoService.WRITE_ATTEMPTS)).setPhoto(7L, null);
    }
}
