<template>
  <v-container grid-list-md>
    <v-layout row wrap>
      <v-flex xs12 md12>
        <v-data-table hide-actions ref="accesshere" item-key="domain"
          :headers="headers" :items="domain.paths" class="elevation-1">

          <template slot="items" slot-scope="props">
            <tr @click="toggleItem( props.item.domain)">
              <td>
                {{ props.item.path }}
              </td>
              <td>
                <router-link :to="`/domains/${domain.domain}/paths/${encodeURIComponent( props.item.path)}/versions`">
                  {{props.item.versions.length}} versions
                </router-link>
              </td>
            </tr>
          </template>
        </v-data-table>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
export default {
  props: {
    domainName: {
      type: String,
      required: true
    }
  },
  data: () => ({
    selected: null,
    domain: { paths: [] },

    headers: [
      {
        text: "Path",
        align: "left",
        sortable: true,
        value: "path"
      },
      {
        text: "Versions",
        align: "left",
        value: "path"
      }
    ]
  }),
  methods: {
    showVersions(path) {
      this.selected = path;
    },
    toggleItem(idx) {
      this.$refs.accesshere.expanded[idx] = !this.$refs.accesshere.expanded[
        idx
      ];
      this.$forceUpdate();
    }
  },
  async created() {
    this.domain = await this.$store.dispatch("getDomain", {
      domainName: this.domainName
    });
  }
};
</script>

<style>
</style>
