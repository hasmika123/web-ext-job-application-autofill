package com.dossier.api.service.mapper;

import com.dossier.api.domain.FieldCache;
import com.dossier.api.domain.User;
import com.dossier.api.service.dto.FieldCacheDTO;
import com.dossier.api.service.dto.UserDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link FieldCache} and its DTO {@link FieldCacheDTO}.
 */
@Mapper(componentModel = "spring")
public interface FieldCacheMapper extends EntityMapper<FieldCacheDTO, FieldCache> {
    @Mapping(target = "user", source = "user", qualifiedByName = "userLogin")
    FieldCacheDTO toDto(FieldCache s);

    @Named("userLogin")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    @Mapping(target = "login", source = "login")
    UserDTO toDtoUserLogin(User user);
}
