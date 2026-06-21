package com.dossier.api.service.mapper;

import com.dossier.api.domain.AiAnswer;
import com.dossier.api.domain.User;
import com.dossier.api.service.dto.AiAnswerDTO;
import com.dossier.api.service.dto.UserDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link AiAnswer} and its DTO {@link AiAnswerDTO}.
 */
@Mapper(componentModel = "spring")
public interface AiAnswerMapper extends EntityMapper<AiAnswerDTO, AiAnswer> {
    @Mapping(target = "user", source = "user", qualifiedByName = "userLogin")
    AiAnswerDTO toDto(AiAnswer s);

    @Named("userLogin")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    @Mapping(target = "login", source = "login")
    UserDTO toDtoUserLogin(User user);
}
