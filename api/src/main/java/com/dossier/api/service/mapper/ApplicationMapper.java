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
