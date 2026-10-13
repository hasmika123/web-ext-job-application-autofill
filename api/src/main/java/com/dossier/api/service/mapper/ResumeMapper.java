package com.dossier.api.service.mapper;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.service.dto.ResumeActorDTO;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.dto.UserDTO;
import com.dossier.api.service.resume.ResumeTags;
import java.util.List;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Resume} and its DTO {@link ResumeDTO}.
 */
@Mapper(componentModel = "spring")
public interface ResumeMapper extends EntityMapper<ResumeDTO, Resume> {
    // kind passes through by name. templateId and the export state live on the web-only resume_doc
    // row, not on Resume, so the mapper leaves them null; ProfileService fills them for BUILT resumes.
    // createdBy/updatedBy (a login plus a display label) and lifecycle are filled by ProfileService too.
    @Mapping(target = "user", source = "user", qualifiedByName = "userLogin")
    @Mapping(target = "templateId", ignore = true)
    @Mapping(target = "contentHash", ignore = true)
    @Mapping(target = "exportedHash", ignore = true)
    @Mapping(target = "exportedAt", ignore = true)
    @Mapping(target = "tags", source = "tagsJson", qualifiedByName = "tagsFromJson")
    @Mapping(target = "createdBy", source = "createdByLogin", qualifiedByName = "actorFromLogin")
    @Mapping(target = "updatedBy", source = "updatedByLogin", qualifiedByName = "actorFromLogin")
    @Mapping(target = "lifecycle", ignore = true)
    @Mapping(target = "score", ignore = true)
    ResumeDTO toDto(Resume s);

    // The audit columns, share flag and role are not set by a DTO round trip: a new entity gets
    // them from its defaults (Resume.prePersist) and an admin edit keeps the stored values.
    @Mapping(target = "tagsJson", source = "tags", qualifiedByName = "tagsToJson")
    @Mapping(target = "createdByLogin", ignore = true)
    @Mapping(target = "updatedByLogin", ignore = true)
    @Mapping(target = "shareWithOrg", ignore = true)
    Resume toEntity(ResumeDTO dto);

    @Named("tagsFromJson")
    default List<String> tagsFromJson(String json) {
        return ResumeTags.parse(json);
    }

    /** Lenient: a tag list that breaks the rules is dropped here (the meta endpoint is the strict path). */
    @Named("tagsToJson")
    default String tagsToJson(List<String> tags) {
        try {
            return tags == null ? null : ResumeTags.write(ResumeTags.normalize(tags));
        } catch (ResumeTags.InvalidTagsException e) {
            return null;
        }
    }

    /** The login with itself as the label; ProfileService swaps in the display names in one lookup. */
    @Named("actorFromLogin")
    default ResumeActorDTO actorFromLogin(String login) {
        return login == null || login.isBlank() ? null : new ResumeActorDTO(login, login);
    }

    @Named("userLogin")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    @Mapping(target = "login", source = "login")
    UserDTO toDtoUserLogin(User user);
}
