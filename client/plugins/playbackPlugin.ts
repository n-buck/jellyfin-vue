import {
  BaseItemDto,
  ItemFields,
  ItemFilter,
  UserDto
} from '@jellyfin/client-axios';
import { Plugin } from '@nuxt/types/app';

type PlaybackType = {
  translateItemsForPlayback: (
    item: BaseItemDto,
    shuffle?: boolean,
    limit?: number
  ) => Promise<string[]>;
};

declare module '@nuxt/types' {
  interface Context {
    $playback: PlaybackType;
  }

  interface NuxtAppOptions {
    $playback: PlaybackType;
  }
}

declare module 'vue/types/vue' {
  interface Vue {
    $playback: PlaybackType;
  }
}

declare module 'vuex/types/index' {
  // eslint-disable-next-line -- Current TypeScript rules flag S as unused, but Nuxt requires identical types
  interface Store<S> {
    $playback: PlaybackType;
  }
}

const playbackPlugin: Plugin = ({ $auth, $items, $tvShows, store }, inject) => {
  inject('playback', {
    /**
     * Converts an item into a set of playable items for the playback manager to handle.
     *
     * @param {BaseItemDto} item - Array of items to translate for playback
     * @param {boolean} shuffle - Request the items in random order
     * @param {number|null} limit - Number of items to fetch
     * @returns {BaseItemDto[]} A set of playable items
     */
    translateItemsForPlayback: async (
      item: BaseItemDto,
      shuffle = false,
      limit?: number
    ): Promise<string[]> => {
      console.time('translateItemsForPlayback');

      const fieldLimit = { limit };

      if (!item) {
        throw new TypeError('item must be defined');
      }

      let translatedItems: string[] = [];

      let responseItems: string[] = [];

      if (item.Type === 'Program' && item.ChannelId) {
        responseItems =
          (await $items.getItems({
            ids: [item.ChannelId],
            sortBy: shuffle ? 'Random' : 'SortName',
            ...fieldLimit
          })) || [];
      } else if (item.Type === 'Playlist') {
        responseItems =
          (await $items.getItems({
            parentId: item.Id,
            sortBy: shuffle ? 'Random' : undefined,
            ...fieldLimit
          })) || [];
      } else if (item.Type === 'MusicArtist' && item.Id) {
        responseItems =
          (await $items.getItems({
            artistIds: [item.Id],
            filters: [ItemFilter.IsNotFolder],
            recursive: true,
            mediaTypes: ['Audio'],
            sortBy: shuffle ? 'Random' : 'SortName',
            ...fieldLimit
          })) || [];
      } else if (item.Type === 'MusicGenre' && item.Id) {
        responseItems =
          (await $items.getItems({
            genreIds: [item.Id],
            filters: [ItemFilter.IsNotFolder],
            recursive: true,
            mediaTypes: ['Audio'],
            sortBy: shuffle ? 'Random' : 'SortName',
            ...fieldLimit
          })) || [];
      } else if (item.IsFolder) {
        responseItems =
          (await $items.getItems({
            parentId: item.Id,
            filters: [ItemFilter.IsNotFolder],
            recursive: true,
            sortBy: ['BoxSet'].includes(item.Type || '')
              ? undefined
              : shuffle
              ? 'Random'
              : 'SortName',
            mediaTypes: ['Audio', 'Video'],
            ...fieldLimit
          })) || [];
      } else if (item.Type === 'Episode') {
        if (
          ($auth.user as UserDto).Configuration?.EnableNextEpisodeAutoPlay &&
          item.SeriesId
        ) {
          // If autoplay is enabled and we have a seriesId, get the rest of the episodes
          responseItems =
            (await $tvShows.getEpisodes({
              seriesId: item.SeriesId,
              isMissing: false,
              fields: [ItemFields.Chapters, ItemFields.PrimaryImageAspectRatio],
              startItemId: item.Id,
              ...fieldLimit
            })) || [];
        } else {
          await store.dispatch('items/addItems', { items: [item] });
          translatedItems.push(item.Id || '');
        }
      } else {
        // This type of item doesn't require any special processing
        await store.dispatch('items/addItems', { items: [item] });
        translatedItems = [item.Id || ''];
      }

      if (responseItems) {
        translatedItems.push(...responseItems);
      }

      console.timeEnd('translateItemsForPlayback');

      return translatedItems;
    }
  });
};

export default playbackPlugin;
