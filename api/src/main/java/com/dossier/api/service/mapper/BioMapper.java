package com.dossier.api.service.mapper;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.User;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.dto.UserDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Bio} and its DTO {@link BioDTO}.
 */
@Mapper(componentModel = "spring")
public interface BioMapper extends EntityMapper<BioDTO, Bio> {
    @Mapping(target = "user", source = "user", qualifiedByName = "userLogin")
    BioDTO toDto(Bio s);

    @Named("userLogin")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    @Mapping(target = "login", source = "login")
    UserDTO toDtoUserLogin(User user);
}
