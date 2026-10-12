package com.dossier.api.service.mapper;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.dto.UserDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Application} and its DTO {@link ApplicationDTO}.
 */
@Mapper(componentModel = "spring")
public interface ApplicationMapper extends EntityMapper<ApplicationDTO, Application> {
    @Mapping(target = "user", source = "user", qualifiedByName = "userLogin")
    @Mapping(target = "resume", source = "resume", qualifiedByName = "resumeLabel")
    // Derived fields: the v2 list / detail / patch services fill them (ApplicationDerivations); the
    // entity has no such properties, so the plain mapping leaves them null (and out of the JSON).
    @Mapping(target = "nextStep", ignore = true)
    @Mapping(target = "ghosted", ignore = true)
    @Mapping(target = "interviewsCount", ignore = true)
    @Mapping(target = "notesCount", ignore = true)
    @Mapping(target = "mailCount", ignore = true)
    ApplicationDTO toDto(Application s);

    @Named("userLogin")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    @Mapping(target = "login", source = "login")
    UserDTO toDtoUserLogin(User user);

    @Named("resumeLabel")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    @Mapping(target = "label", source = "label")
    ResumeDTO toDtoResumeLabel(Resume resume);
}
