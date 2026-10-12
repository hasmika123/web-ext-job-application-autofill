package com.dossier.api.service.mapper;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.dto.UserDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Resume} and its DTO {@link ResumeDTO}.
 */
@Mapper(componentModel = "spring")
public interface ResumeMapper extends EntityMapper<ResumeDTO, Resume> {
    // kind passes through by name. templateId and the export state live on the web-only resume_doc
    // row, not on Resume, so the mapper leaves them null; ProfileService fills them for BUILT resumes.
    @Mapping(target = "user", source = "user", qualifiedByName = "userLogin")
    @Mapping(target = "templateId", ignore = true)
    @Mapping(target = "contentHash", ignore = true)
    @Mapping(target = "exportedHash", ignore = true)
    @Mapping(target = "exportedAt", ignore = true)
    @Mapping(target = "score", ignore = true)
    ResumeDTO toDto(Resume s);

    @Named("userLogin")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    @Mapping(target = "login", source = "login")
    UserDTO toDtoUserLogin(User user);
}
