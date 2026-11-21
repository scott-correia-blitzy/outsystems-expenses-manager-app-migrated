package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.MappedSuperclass;
import java.time.LocalDateTime;

@MappedSuperclass
public abstract class InvoiceEntity {

    // Shared key: the owning line's id, so each line has at most one invoice.
    @Id
    @Column(name = "Id")
    private Long id;

    // Lazy via build-time enhancement; assigning it on a fetched invoice still loads the old bytes first.
    @Lob
    @Basic(fetch = FetchType.LAZY)
    @Column(name = "Content")
    private byte[] content;

    @Column(name = "Filename", length = 50)
    private String filename;

    @Column(name = "Filetype", length = 50)
    private String filetype;

    @Column(name = "Datetime")
    private LocalDateTime datetime;

    protected InvoiceEntity() {
    }

    protected InvoiceEntity(Long id) {
        this.id = id;
    }

    public Long getId() {
        return id;
    }

    public byte[] getContent() {
        return content;
    }

    public void setContent(byte[] content) {
        this.content = content;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public String getFiletype() {
        return filetype;
    }

    public void setFiletype(String filetype) {
        this.filetype = filetype;
    }

    public LocalDateTime getDatetime() {
        return datetime;
    }

    public void setDatetime(LocalDateTime datetime) {
        this.datetime = datetime;
    }
}
