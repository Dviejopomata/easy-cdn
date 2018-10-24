<template>
  <v-container>
    <v-layout>
      <v-flex xs12 md12>
        <v-card>
          <v-card-title>Path details</v-card-title>
          <v-card-text>
            <v-text-field readonly label="Domain" :value="domain.domain"></v-text-field>
            <v-text-field readonly label="Path" :value="domainPath.path"></v-text-field>
            <v-text-field readonly label="Active version"
              :value="domainPath.activeVersion"></v-text-field>
            <v-subheader>
              Versions
            </v-subheader>
            <v-data-table :pagination.sync="pagination"
              item-key="path" :headers="versionHeaders"
              :items="versions" class="elevation-1">

              <template slot="items" slot-scope="props">
                <tr>
                  <td> {{props.item.date | d}} </td>
                  <td> {{props.item.etag}} </td>
                  <td class="text-xs-right">
                    {{props.item.size}} </td>
                  <td>
                    {{props.item.active? "Yes":"No"}}
                  </td>
                  <td>
                    <v-menu offset-y>
                      <v-btn slot="activator" icon>
                        <v-icon>more_vert</v-icon>
                      </v-btn>
                      <v-list>
                        <v-list-tile @click="setActiveVersion(props.item.version)">
                          <v-list-tile-title>Set active</v-list-tile-title>
                        </v-list-tile>
                      </v-list>
                    </v-menu>
                  </td>
                </tr>
              </template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
export default {
  data() {
    return {
      pagination: {
        rowsPerPage: 25,
        descending: true,
        sortBy: "date"
      },
      versions: [],
      domainPath: {},
      domain: { paths: [] },
      versionHeaders: [
        {
          text: "Date",
          align: "left",
          value: "date"
        },
        {
          text: "Etag",
          align: "left",
          sortable: true,
          value: "etag"
        },
        {
          text: "Size",
          align: "right",
          sortable: true,
          value: "size"
        },
        {
          text: "Active",
          align: "left",
          sortable: true,
          value: "active"
        },
        {
          text: "",
          align: "left",
          value: "path",
          sortable: false
        }
      ]
    };
  },
  methods: {
    async init() {
      const { domainName, path } = this.$route.params;
      this.domain = await this.$store.dispatch("getDomain", {
        domainName
      });
      const domainPath = this.domain.paths.find(i => i.path === path);
      if (domainPath) {
        this.domainPath = domainPath;
        this.versions = domainPath.versions.map(v => ({
          ...v,
          active: v.version === domainPath.activeVersion
        }));
      }
      this.$store.commit("setBreadcrumbs", [
        {
          text: "Domains",
          to: "/domains"
        },
        {
          text: domainName,
          to: `/domains/${domainName}`
        },
        {
          text: `Path ${path}`,
          disabled: true
        }
      ]);
    },
    async setActiveVersion(version) {
      await this.$store.dispatch("setVersion", {
        domain: this.domain.domain,
        path: this.domainPath.path,
        version
      });
      await this.init();
    }
  },
  async created() {
    await this.init();
  }
};
</script>

<style>
</style>
